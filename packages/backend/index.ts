import Koa from "koa"
import bodyParser from "koa-bodyparser"
import logger from "koa-logger"

import auth from "./api/v1/auth"
import v1 from "./api/v1"
import redirections from "./api/v1/redirections"
import webhooks from "./api/webhooks"
import { corsMiddleware } from "./utils/cors"
import { setupCronJobs } from "./utils/cron"
import { checkDbConnection } from "./utils/db"
import { z } from "zod"
import { authMiddleware } from "./api/v1/auth/utils"

await checkDbConnection()
setupCronJobs()

const app = new Koa()

app.use(async (ctx, next) => {
  try {
    await next()
  } catch (error: unknown) {
    console.error(error)

    if (error instanceof z.ZodError) {
      ctx.status = 422
      ctx.body = error.errors[0]
      return
    }

    ctx.status = error.statusCode || error.status || 500
    ctx.body = {
      message: error.message,
    }
  }
})

// MiddleWares
app.use(logger())
app.use(corsMiddleware)
app.use(authMiddleware)

app.use(bodyParser())

// Routes
app.use(redirections.routes())
app.use(v1.routes())
app.use(auth.routes())
app.use(webhooks.routes())

const PORT = Number(Bun.env.PORT || 3333)
app.listen(PORT, () => console.log(`✅ Koa server listening on port ${PORT}`))