import { Redirect } from "expo-router";
import type { Href } from "expo-router";

export default function CaptureTabRedirect() {
  return <Redirect href={"/capture" as Href} />;
}
