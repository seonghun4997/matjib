import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://650b21f6b7d051a702e0f3e91f478d20@o4511750885670912.ingest.us.sentry.io/4511751380795392",
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enableLogs: false,
  debug: false,
});
