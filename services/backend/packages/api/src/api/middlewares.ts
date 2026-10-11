import { defineMiddlewares } from "@medusajs/medusa";
import { validateAndTransformBody } from "@medusajs/framework/http";
import {
    AdminCmsContentCommand,
    AdminCmsPublicationCommand,
} from "./admin/buildkart/merchandising/validators";

export default defineMiddlewares({
    routes: [
        {
            matcher: "/admin/buildkart/merchandising/:type",
            method: ["POST"],
            middlewares: [validateAndTransformBody(AdminCmsContentCommand)],
        },
        {
            matcher: "/admin/buildkart/merchandising/:type/:documentId",
            method: ["POST"],
            middlewares: [validateAndTransformBody(AdminCmsContentCommand)],
        },
        {
            matcher: "/admin/buildkart/merchandising/:type/:documentId/publish",
            method: ["POST"],
            middlewares: [validateAndTransformBody(AdminCmsPublicationCommand)],
        },
        {
            matcher: "/admin/buildkart/merchandising/:type/:documentId/unpublish",
            method: ["POST"],
            middlewares: [validateAndTransformBody(AdminCmsPublicationCommand)],
        },
    ],
});
