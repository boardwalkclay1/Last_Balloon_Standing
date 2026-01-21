// ble-bridge.js
// This file is loaded in index.html before app.js

window.BLEBridge = {
  async startHost() {
    // Native side: start advertising + accept connections
    // Here we just call into Capacitor plugin
    if (!window.Capacitor || !window.Capacitor.Plugins) return;
    const { BluetoothLe } = window.Capacitor.Plugins;

    await BluetoothLe.initialize();
    // You’d implement a custom GATT server in native code or via plugin extension.
  },

  async startClient() {
    if (!window.Capacitor || !window.Capacitor.Plugins) return;
    const { BluetoothLe } = window.Capacitor.Plugins;

    await BluetoothLe.initialize();
    // Scan + connect to host peripheral, subscribe to state characteristic,
    // and call window.onBleStateReceived(jsonString) on notifications.
  },

  broadcastState(jsonString) {
    if (!window.Capacitor || !window.Capacitor.Plugins) return;
    const { BluetoothLe } = window.Capacitor.Plugins;
    // Write jsonString to state characteristic for all connected clients
    // Native plugin should handle iterating connections.
  },

  sendAction(jsonString) {
    if (!window.Capacitor || !window.Capacitor.Plugins) return;
    const { BluetoothLe } = window.Capacitor.Plugins;
    // Write jsonString to host's action characteristic
  },
};
