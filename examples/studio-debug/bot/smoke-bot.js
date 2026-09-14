// Transport smoke test only: no Maopao bot or hardware is simulated.
console.log("Studio bot console 已连接", { runtime: process.version });
console.info("普通业务代码不需要调用 Studio API");
console.warn("这是一条测试 warning");
console.error("这是一条测试 error，不会导致进程退出", new Error("Demo error stack"));
const circular = { message: "循环引用和 BigInt", count: 123n, token: "example-secret-token" };
circular.self = circular;
console.log(circular);
const timer = setInterval(() => console.log("bot heartbeat", { at: new Date().toISOString() }), 5000);
process.on("SIGTERM", () => { clearInterval(timer); });
