const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    send: (channel, data) => {
        let validChannels = ['toMain', 'minimize-window', 'maximize-window', 'close-window', 'restart_app'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        let validChannels = ['fromMain', 'update-available', 'update-downloaded', 'download-progress', 'update-error', 'update-status', 'image-viewer-data'];
        if (validChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` 
            const listener = (event, ...args) => func(...args);
            ipcRenderer.on(channel, listener);
            return () => ipcRenderer.removeListener(channel, listener);
        }
    },
    invoke: (channel, data) => {
        let validChannels = ['invokeMain', 'open-image-viewer', 'get-image-viewer-data', 'focus-main-window', 'report-ai-status', 'report-ai-configure', 'report-ai-models', 'report-ai-run', 'report-ai-cancel', 'report-source-open', 'report-source-capture'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    }
});
