import crypto from 'crypto';
import connectToDb from '@/lib/db';
import User from '@/models/User';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token || typeof token !== 'string' || token.length < 10) {
      return Response.json({ ok: false, error: 'Invalid token' }, { status: 400 });
    }

    await connectToDb();
    
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // First, try to find user by valid token (not expired)
    let user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExp: { $gt: new Date() },
    });

    // If token not found or expired, try to find by token hash anyway
    if (!user) {
      user = await User.findOne({
        emailVerificationTokenHash: tokenHash,
      });
      
      // If found but token was already used (removed) or expired, check if email is verified
      // This handles case when user clicks link twice - first time verifies, second time finds nothing
      if (user && user.isEmailVerified) {
        // User already verified - this is OK, return success
        return Response.json({ ok: true, alreadyVerified: true, username: user.username }, { status: 200 });
      }
      
      // Token not found at all
      if (!user) {
        return Response.json({ ok: false, error: 'Invalid token' }, { status: 400 });
      }
      
      // User found but token expired and not verified
      return Response.json({ ok: false, error: 'Token expired' }, { status: 400 });
    }

    // User already verified? - still return success (handles double-click)
    if (user.isEmailVerified) {
      return Response.json({ ok: true, alreadyVerified: true, username: user.username }, { status: 200 });
    }

    // Verify email - this is the first time verification
    user.isEmailVerified = true;
    // Mark token as used by setting expiration to past (don't delete, so we can find user on second click)
    user.emailVerificationTokenExp = new Date(0); // Set to epoch (1970) to mark as used
    await user.save();

    return Response.json({ ok: true, username: user.username, verified: true }, { status: 200 });
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('verify-email error:', e);
      console.error('Error stack:', e.stack);
    }
    return Response.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

