export function printJson(data: unknown, pretty = false): void {
  console.log(pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
}
