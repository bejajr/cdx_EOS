import { fail, notImplemented } from "../_shared";

export async function GET() {
  return notImplemented("/api/chat");
}

export async function POST() {
  try {
    return notImplemented("/api/chat");
  } catch (error) {
    return fail(error);
  }
}
