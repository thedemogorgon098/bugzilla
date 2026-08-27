"use client";

import { io, Socket } from "socket.io-client";
import { API, getUser } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API, {
      transports: ["websocket", "polling"],
      auth: { user: getUser() },
    });
  }
  return socket;
}
