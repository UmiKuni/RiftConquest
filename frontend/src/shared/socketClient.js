import { io } from "socket.io-client";
import { socketUrl } from "./backend.js";

function createSocket(options = {}) {
  return io(socketUrl(), options);
}

window.io = io;
window.rcSocket = {
  createSocket,
};
