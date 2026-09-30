import { describe, expect, it } from "vitest";
import { Theme } from "./emit";

describe("control styles several controls share", () => {
  it("are renamed after what those controls are", () => {
    const theme = new Theme([]);
    const naming = { shared: "input_field", noun: "text_field" };
    const email = theme.control("ui::TextFieldStyle", "email_field", ".idle = {},", "", naming);
    const password = theme.control("ui::TextFieldStyle", "password_field", ".idle = {},", "", naming);
    expect(email).toBe("styles::email_field");
    expect(password).toBe(email);
    expect(theme.settleControlNames()).toEqual(new Map([["email_field", "input_field"]]));
  });

  it("fall back to the widget kind when the controls' layers disagree, and never to a keyword", () => {
    const theme = new Theme([]);
    theme.control("ui::ToggleStyle", "sound_switch", ".track = {},", "", { shared: "sound_switch", noun: "switch" });
    theme.control("ui::ToggleStyle", "music_switch", ".track = {},", "", { shared: "music_switch", noun: "switch" });
    theme.control("ui::SliderStyle", "volume_slider", ".track = {},", "", { shared: "slider", noun: "slider" });
    const renames = theme.settleControlNames();
    expect(renames.get("sound_switch")).toBe("switch_style");
    expect(renames.has("volume_slider")).toBe(false);
  });
});
