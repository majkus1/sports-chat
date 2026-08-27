import mongoose from 'mongoose';
import createMessageSchema from './messageSchema.cjs';

/** Schemat współdzielony z server.js — patrz models/messageSchema.cjs */
const Message =
	mongoose.models.Message || mongoose.model('Message', createMessageSchema(mongoose));

export default Message;
