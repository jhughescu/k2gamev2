class VersionControl {
    constructor() {
        this.versionInfo = null;
        this.sessionID = null;
        this.storeID = `k2-dev-version`;
        this.initialize();
    }
    initialize() {
        this.getVersion();
    }
    updateVersion(sessionID) {
        localStorage.setItem(this.storeID, this.versionInfo.timestamp);
        return `version set to ${this.versionInfo.timestamp}`;
    }
    isCurrentVersion() {
        const storedTimestamp = localStorage.getItem(this.storeID);
        // If no timestamp is found in localStorage, assume the version is current
        if (!storedTimestamp) {
//            console.log(`No stored timestamp found. Assuming the current version is up to date.`);
            this.updateVersion();
            return true;
        }
        // Compare timestamps if a stored value exists
        const timestampStored = moment(storedTimestamp);
        const timestampBuild = moment(this.versionInfo.timestamp);
        const isCurrent = !timestampBuild.isAfter(timestampStored);
//        console.log(`Stored Timestamp: ${storedTimestamp}`);
//        console.log(`Build Timestamp: ${this.versionInfo.timestamp}`);
//        console.log(`Is current version? ${isCurrent}`);
        return isCurrent;
    }
    async getVersion() {
        try {
            this.versionInfo = await this.loadVersionInfo();
        } catch (err) {
            console.error('Failed to load version info:', err);
        }
    }
    loadVersionInfo() {
        return $.getJSON('data/build-info.json');
    }
}
