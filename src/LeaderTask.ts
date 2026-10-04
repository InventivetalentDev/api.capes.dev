import * as Sentry from "@sentry/node";
import { Lease } from "./database/schemas/lease";
import { INSTANCE_ID } from "./util";
import { info, warn } from "./util/colors";

/**
 * A periodic job that only one instance runs at a time, for work that would otherwise be
 * repeated by every instance (and every server) sharing the database.
 *
 * Instances compete for a lease document in mongo; the holder renews it every interval and
 * runs the task, everyone else just keeps trying. If the holder dies without releasing the
 * lease, another instance takes over once it expires (after `leaseIntervals` missed renewals).
 */
export class LeaderTask {

    private static readonly tasks: Set<LeaderTask> = new Set<LeaderTask>();

    private timer?: NodeJS.Timeout;
    private running = false;
    private _isLeader = false;

    constructor(readonly name: string, readonly interval: number, readonly task: () => Promise<void>, readonly leaseIntervals: number = 3) {
    }

    get isLeader(): boolean {
        return this._isLeader;
    }

    start(): this {
        LeaderTask.tasks.add(this);
        this.tick();
        this.timer = setInterval(() => this.tick(), this.interval);
        return this;
    }

    private async tick(): Promise<void> {
        try {
            const wasLeader = this._isLeader;
            this._isLeader = await tryAcquireLease(this.name, this.interval * this.leaseIntervals);
            if (this._isLeader !== wasLeader) {
                console.log((this._isLeader ? info : warn)(`${ this._isLeader ? "Acquired" : "Lost" } leadership of ${ this.name } task (${ INSTANCE_ID })`));
            }
        } catch (e) {
            this._isLeader = false;
            console.warn(warn(`Failed to acquire lease for ${ this.name } task`), e);
            Sentry.captureException(e);
            return;
        }

        // the lease keeps getting renewed above even if a slow run overlaps the next tick
        if (!this._isLeader || this.running) {
            return;
        }
        this.running = true;
        try {
            await this.task();
        } catch (e) {
            console.warn(warn(`${ this.name } task failed`), e);
            Sentry.captureException(e);
        } finally {
            this.running = false;
        }
    }

    async stop(): Promise<void> {
        LeaderTask.tasks.delete(this);
        if (this.timer) {
            clearInterval(this.timer);
        }
        if (this._isLeader) {
            this._isLeader = false;
            // let another instance take over right away instead of waiting for the lease to expire
            await Lease.deleteOne({ _id: this.name, owner: INSTANCE_ID }).exec();
        }
    }

    static async stopAll(): Promise<void> {
        await Promise.all(Array.from(this.tasks).map(t => t.stop()));
    }

}

async function tryAcquireLease(name: string, ttl: number): Promise<boolean> {
    const now = new Date();
    try {
        // matches only if we already hold the lease or it expired; otherwise the upsert
        // collides with the existing document and fails with a duplicate key error
        await Lease.updateOne(
            { _id: name, $or: [{ owner: INSTANCE_ID }, { expiresAt: { $lt: now } }] },
            { $set: { owner: INSTANCE_ID, expiresAt: new Date(now.getTime() + ttl) } },
            { upsert: true }
        ).exec();
        return true;
    } catch (e) {
        if (e.code === 11000) {
            return false;
        }
        throw e;
    }
}
