// The site moved from barber-voice-agent.weboostai.workers.dev to umnik.weboostai.workers.dev:
// every address (pages, API, Meta callbacks) is sent to the same path there. 308 keeps POST bodies.
export default {
  fetch(req) {
    const url = new URL(req.url);
    url.hostname = "umnik.weboostai.workers.dev";
    return Response.redirect(url.toString(), 308);
  },
};
