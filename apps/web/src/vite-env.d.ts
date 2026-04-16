/// <reference types="vite/client" />

declare type SocketClient = {
	emit: (event: string, payload?: unknown) => void;
	on: (event: string, handler: (payload: unknown) => void) => void;
	off: (event: string, handler?: (payload: unknown) => void) => void;
	disconnect: () => void;
};

declare const io: (url: string, options?: Record<string, unknown>) => SocketClient;
