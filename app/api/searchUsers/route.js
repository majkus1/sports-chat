import connectToDb from '@/lib/db';
import User from '@/models/User';

export async function GET(request) {
  await connectToDb();

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return Response.json({ success: false, message: 'Query parameter is required.' }, { status: 400 });
  }

  try {
    const users = await User.find({ username: new RegExp(query, 'i') }).select('username -_id');
    return Response.json({ success: true, users }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error searching users:', error);
    }
    return Response.json({ success: false, message: 'Internal Server Error.' }, { status: 500 });
  }
}

