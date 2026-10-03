/** The protocol is shared by all three processes and contains no Electron imports. */
declare const PROTOCOL_VERSION: 1;
declare const INVOKE_CHANNEL = "__valence_invoke__";
declare const BRIDGE_NAME = "__valence";
interface InvokeRequest {
    protocol: typeof PROTOCOL_VERSION;
    id: string;
    callId: string;
    args: unknown[];
}
interface SerializedError {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
    cause?: SerializedError;
}
type InvokeResponse = {
    protocol: typeof PROTOCOL_VERSION;
    callId: string;
    ok: true;
    value: unknown;
} | {
    protocol: typeof PROTOCOL_VERSION;
    callId: string;
    ok: false;
    error: SerializedError;
};
interface MainBridge {
    readonly development: boolean;
    invoke(request: InvokeRequest): Promise<InvokeResponse>;
}
declare function isRecord(value: unknown): value is Record<string, unknown>;
declare function isIdentifier(value: unknown): value is string;
declare function isInvokeRequest(value: unknown): value is InvokeRequest;
declare function isInvokeResponse(value: unknown): value is InvokeResponse;

export { BRIDGE_NAME, INVOKE_CHANNEL, type InvokeRequest, type InvokeResponse, type MainBridge, PROTOCOL_VERSION, type SerializedError, isIdentifier, isInvokeRequest, isInvokeResponse, isRecord };
