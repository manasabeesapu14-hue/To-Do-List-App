import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured for private task sessions.");
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser(sessionSecret));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const existingSession = req.signedCookies?.todo_session;
  const isValidSession =
    typeof existingSession === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      existingSession,
    );
  const sessionId = isValidSession ? existingSession : randomUUID();

  if (!isValidSession) {
    res.cookie("todo_session", sessionId, {
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      signed: true,
    });
  }

  res.locals.todoSessionId = sessionId;
  next();
});

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err: error }, "Unhandled API error");
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
