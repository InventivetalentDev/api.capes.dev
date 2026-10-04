import { Document, model, Model, Schema } from "mongoose";

export interface ILeaseDocument extends Document<string> {
    owner: string;
    expiresAt: Date;
}

export const LeaseSchema: Schema<ILeaseDocument> = new Schema({
    _id: String,
    owner: String,
    expiresAt: Date
});

export const Lease: Model<ILeaseDocument> = model<ILeaseDocument>("Lease", LeaseSchema, "leases");
