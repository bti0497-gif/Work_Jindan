import { NextResponse } from 'next/server';

export async function GET() {
  // 간단한 헬스 체크. 필요시 DB/외부 API 상태를 추가로 검사할 수 있음
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
