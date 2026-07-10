import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

export function getRouter() {
  return createRouter({ routeTree, context: { queryClient } });
}
