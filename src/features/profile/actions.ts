"use server";

import { revalidatePath } from "next/cache";

import { fromThrown, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentActor } from "@/lib/current-actor";

import { saveProfileSettings, type ProfileSettings } from "./service";

export async function saveProfileSettingsAction(input: ProfileSettings): Promise<ActionResult<{ message: string; settings: ProfileSettings }>> {
  try {
    const actor = await getCurrentActor();
    const settings = await saveProfileSettings(actor, input);
    revalidatePath("/");
    revalidatePath("/progress");
    revalidatePath("/settings");
    return ok({ message: "Settings saved.", settings });
  } catch (error) {
    return fromThrown(error, "Could not save your settings.", "/settings");
  }
}