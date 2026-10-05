import { connect } from "nats";
import { loadConfig } from "../config.js";

const config = loadConfig(process.env);
const nc = await connect({ servers: config.natsUrl });
const jsm = await nc.jetstreamManager();

const info = await jsm.streams.info("BUILDKART_EVENTS");
const messages = info.state.messages;
const subjects = info.state.num_subjects;

console.log(`stream BUILDKART_EVENTS: ${messages} messages across ${subjects} subjects`);
console.log(messages > 0 ? "PASS: cross-system events are published to NATS JetStream" : "FAIL: stream empty");
await nc.drain();
process.exit(messages > 0 ? 0 : 1);
