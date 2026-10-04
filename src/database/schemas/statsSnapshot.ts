import { Document, model, Model, Schema } from "mongoose";

export interface IStatsSnapshotDocument extends Document<string> {
    total: number;
    players: number;
    types: { [s: string]: number; };
    updatedAt: Date;
}

export const StatsSnapshotSchema: Schema<IStatsSnapshotDocument> = new Schema({
    _id: String,
    total: Number,
    players: Number,
    types: Schema.Types.Mixed,
    updatedAt: Date
});

export const StatsSnapshot: Model<IStatsSnapshotDocument> = model<IStatsSnapshotDocument>("StatsSnapshot", StatsSnapshotSchema, "stats_snapshots");
