class Storage {
  constructor() {
    this.storage = new Map();
  }
  set(id, value) {
    this.storage.set(id, value);
  }
  get(id) {
    return this.storage.get(id);
  }
  getAllMessages() {
    let array = [];
    Array.from(this.storage).forEach(item => array.push(item));
    return array;
  }
  getMessage(id) {
    const msg = this.storage.get(id);
    if (msg) return [id, msg];
    return null;
  }
}

class Attachments {
  constructor() {
    this.attachments = new Map();
  }
  getAttachments(id) {
    return this.attachments.get(id);
  }
  timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
