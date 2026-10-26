/**
 * Transport contract interface and connection states.
 * Standardizes the networking layer across Solo, Fake (unit tests), and PeerJS WebRTC implementations.
 */

export const ConnectionStates = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
});

/**
 * Interface contract for room network transports.
 *
 * @typedef {object} RoomTransportContract
 * @property {string} connectionState Current ConnectionStates value
 * @property {string} peerId Local peer/client identifier
 * @property {boolean} isHost Whether this transport represents the host node
 * @property {() => number} now Monotonic or synchronized room timestamp
 * @property {(options: object) => Promise<void>} connect Connect to signaling/room
 * @property {(message: object) => void} send Send a message to the room or host
 * @property {(listener: (msg: object) => void) => () => void} subscribe Listen to incoming messages
 * @property {() => void} close Disconnect and clean up resources
 */

/**
 * Validates whether an object conforms to the RoomTransportContract.
 *
 * @param {any} transport
 * @returns {boolean}
 */
export function isRoomTransport(transport) {
  if (!transport || typeof transport !== 'object') return false;
  return (
    typeof transport.connect === 'function' &&
    typeof transport.send === 'function' &&
    typeof transport.subscribe === 'function' &&
    typeof transport.close === 'function' &&
    typeof transport.now === 'function' &&
    typeof transport.isHost === 'boolean' &&
    typeof transport.peerId === 'string' &&
    Object.values(ConnectionStates).includes(transport.connectionState)
  );
}
