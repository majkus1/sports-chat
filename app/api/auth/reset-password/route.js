import crypto from 'crypto';
import bcrypt from 'bcrypt';
import connectToDb from '@/lib/db';
import User from '@/models/User';

export async function POST(request) {
  const body = await request.json();
  const { token, password } = body || {};

  if (!token || !password || typeof password !== 'string' || password.length < 8) {
    return Response.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }

  try {
    await connectToDb();
    
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordTokenExp: { $gt: new Date() },
    });

    if (!user) {
      return Response.json({ ok: false, error: 'Invalid or expired token' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);
    user.password = hashed;
    user.resetPasswordTokenHash = null;
    user.resetPasswordTokenExp = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('reset-password error:', e);
    return Response.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

