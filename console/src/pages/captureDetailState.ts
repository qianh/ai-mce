export function isCurrentDetailRequest(currentRequestId: number, requestId: number): boolean {
  return currentRequestId === requestId;
}
