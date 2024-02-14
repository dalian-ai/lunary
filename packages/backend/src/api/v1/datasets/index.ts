import sql from "@/src/utils/db"
import Context from "@/src/utils/koa"
import Router from "koa-router"
import { z } from "zod"
import { getDataset } from "./utils"

const datasets = new Router({
  prefix: "/datasets",
})

datasets.get("/", async (ctx: Context) => {
  const { projectId } = ctx.state

  const rows = await sql`
    select
      d.id, 
      d.created_at, 
      d.updated_at, 
      d.owner_id,
      d.slug,
      d.project_id,
      (select count(*) from dataset_prompt where dataset_id = d.id) as prompt_count 
    from
      dataset d
      left join dataset_prompt as dp on dp.dataset_id = dp.id
    where
      project_id = ${projectId}
    order by
      updated_at desc
  `

  ctx.body = rows
})

datasets.get("/:id", async (ctx: Context) => {
  const { projectId } = ctx.state
  const { id } = ctx.params

  const dataset = await getDataset(id)
  if (dataset.projectId !== projectId) {
    ctx.throw(401, "Not Authorized")
  }

  ctx.body = dataset
})

datasets.post("/", async (ctx: Context) => {
  //TODO: full zod
  const { projectId, userId } = ctx.state
  const body = z.object({
    slug: z.string(),
  })

  const { slug } = body.parse(ctx.request.body)
  const { prompts } = ctx.request.body

  const [insertedDataset] = await sql`
    insert into dataset ${sql({
      slug,
      ownerId: userId,
      projectId,
    })} returning *
  `

  for (const { messages, variations } of prompts) {
    const [insertedPrompt] = await sql`insert into dataset_prompt 
    ${sql({
      datasetId: insertedDataset.id,
      messages,
    })} 
    returning *`
    for (const variation of variations) {
      const variationToInsert = {
        promptId: insertedPrompt.id,
        variables: variation.variables,
        context: variation.context,
        idealOutput: variation.idealOutput,
      }

      await sql`insert into dataset_prompt_variation ${sql(variationToInsert)} returning *`
    }
  }

  ctx.status = 201
  ctx.body = { datasetId: insertedDataset.id }
})

// TODO: use params
datasets.patch("/", async (ctx: Context) => {
  //TODO: full zod
  const { projectId, userId } = ctx.state
  const body = z.object({
    slug: z.string(),
  })

  const { prompts, datasetId } = ctx.request.body

  for (const { messages, variations, id } of prompts) {
    const [existingPrompt] =
      await sql`select * from dataset_prompt where id = ${id}`

    if (existingPrompt) {
      const [updatedPrompt] = await sql`
        update dataset_prompt set messages =  ${messages}
        where id = ${id}
        returning *
      `

      for (const variation of variations) {
        const variationToInsert = {
          promptId: updatedPrompt.id,
          variables: variation.variables,
          context: variation.context,
          idealOutput: variation.idealOutput,
        }

        await sql`insert into dataset_prompt_variation ${sql(variationToInsert)} returning *`
      }
    } else {
      const [insertedPrompt] = await sql`insert into dataset_prompt 
      ${sql({
        datasetId,
        messages,
      })} 
      returning *
      `

      for (const variation of variations) {
        const variationToInsert = {
          promptId: insertedPrompt.id,
          variables: variation.variables,
          context: variation.context,
          idealOutput: variation.idealOutput,
        }

        await sql`insert into dataset_prompt_variation ${sql(variationToInsert)} returning *`
      }
    }

    // if (existingPrompt) {
    //   await sql`
    //     update dataset_prompt set messages = ${messages}
    //     where id = ${id}
    //   `

    //   for (const variation of variations) {
    //     if (variation.id) {
    //       await sql`update dataset_prompt_variation
    //         set variables = ${variation.variables},
    //             context = ${variation.context},
    //             ideal_output = ${variation.idealOutput}
    //         where id = ${variation.id}
    //       `
    //     } else {
    //       await sql`insert into dataset_prompt_variation
    //         (prompt_id, variables, context, ideal_output)
    //         values (${existingPrompt.id}, ${variation.variables}, ${variation.context}, ${variation.idealOutput})
    //       `
    //     }
    //   }
    // }
  }

  ctx.status = 200
  ctx.body = { datasetId }
})
// datasets.post("/:id/runs", async (ctx: Context) => {
//   const { projectId, id } = ctx.params
//   const { run } = ctx.request.body as {
//     run: {
//       input: any
//       output: any
//     }
//   }

//   // insert into jsonb[] runs

//   await sql`
//     update dataset
//     set runs = runs || ${sql.json(run)}, updated_at = now()
//     where project_id = ${projectId} and id = ${id}
//   `

//   ctx.status = 201
// })

// datasets.del("/:id/runs/:index", async (ctx: Context) => {
//   const { projectId, id, index } = ctx.params

//   // remove from jsonb[] from the run at index
//   await sql`
//     update dataset
//     set runs = runs - ${index}, updated_at = now()
//     where project_id = ${projectId} and id = ${id}
//   `

//   ctx.status = 200
// })

export default datasets