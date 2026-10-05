export {};
// Separate operator entry; never imported by the production server.
if(!process.argv.includes("--offline-fixture")) throw Error("Explicit offline flag required.");
const {createLocalCommitteeApp}=await import("./committee-local-fixture");
createLocalCommitteeApp().listen(19623,"127.0.0.1",()=>console.log("Offline committee fixture: http://127.0.0.1:19623"));
