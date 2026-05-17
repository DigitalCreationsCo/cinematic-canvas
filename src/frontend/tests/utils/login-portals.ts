import type { Page } from "@playwright/test";

export const loginPortals = async (page: Page) => {
  await page.goto("/");
  await page.getByPlaceholder("Username").fill("portals");
  await page.getByPlaceholder("Password").fill("portals");
  await page.getByRole("button", { name: "Sign In" }).click();
};
