const music = require("../../commands/music/music");

module.exports = {
  getQueue: music.musicGetQueue,
  destroyQueue: music.musicDestroyQueue,
  queues: music.musicQueues,
  getShoukaku: music.getShoukaku,
};
