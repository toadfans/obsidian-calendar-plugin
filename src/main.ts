import type { Moment, WeekSpec } from "moment";
import { App, Plugin, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_CALENDAR } from "./constants";
import { settings } from "./ui/stores";
import {
  appHasPeriodicNotesPluginLoaded,
  CalendarSettingsTab,
  ISettings,
} from "./settings";
import CalendarView from "./view";
import * as Lunar from "lunar-typescript";

declare global {
  interface Window {
    app: App;
    moment: () => Moment;
    _bundledLocaleWeekSpec: WeekSpec;
  }
}

export default class CalendarPlugin extends Plugin {
  public options: ISettings;
  private view: CalendarView;

  onunload(): void {
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CALENDAR)
      .forEach((leaf) => leaf.detach());
  }

  async onload(): Promise<void> {
    window.Lunar = Lunar;
    const getLunarInfo = (date) => {
      const getDisplayHoliday = (d, s) => {
        const solarFestivals = s.getFestivals();
        const lunarFestivals = d.getFestivals();
        const festivals = [...lunarFestivals, ...solarFestivals];
        return festivals.length > 0
          ? festivals[0].length < 4
            ? festivals[0].replace("节", "")
            : undefined
          : undefined;
      };

      // https://github.com/DevilRoshan/obsidian-lunar-calendar/blob/main/src/redux/notes.ts#L123
      const d = Lunar.Lunar.fromDate(date.toDate());
      const s = Lunar.Solar.fromDate(date.toDate());
      const solarTerm = d.getJieQi();
      const displayHoliday = getDisplayHoliday(d, s);
      const h = Lunar.HolidayUtil.getHoliday(
        date.get("year"),
        date.get("month") + 1,
        date.get("date")
      );
      const displayDay =
        d.getDay() === 1
          ? d.getMonthInChinese().concat("月")
          : d.getDayInChinese();

      const lunarDisplay = displayHoliday || solarTerm || displayDay;
      const lunarReal = `${d
        .getMonthInChinese()
        .concat("月")}${d.getDayInChinese()}`;
      const lunarValues = [displayHoliday, solarTerm, lunarReal].filter(
        (p) => !!p
      );

      // https://github.com/6tail/lunar-typescript
      // https://6tail.cn/calendar/api.html#solar.festivals.html
      const festivals = [
        d.getJieQi(),
        ...d.getFestivals(),
        ...d.getOtherFestivals(),
        ...s.getFestivals(),
        ...s.getOtherFestivals(),
      ]
        .filter((t) => !!t)
        .join("，");
      const lunarLabel = `${d.getYearInGanZhi()}${d.getYearShengXiao()}年${d.getMonthInChinese()}月${d.getDayInChinese()}${
        festivals ? `。${festivals}` : ""
      }。星期${s.getWeekInChinese()}。${d.getYueXiang()}月。`;

      return {
        d,
        s,
        lunarDisplay,
        lunarValues,
        lunarLabel,
        lunarReal,
        h,
      };
    };

    window.getLunarInfo = getLunarInfo;

    this.register(
      settings.subscribe((value) => {
        this.options = value;
      })
    );

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => (this.view = new CalendarView(leaf))
    );

    this.addCommand({
      id: "show-calendar-view",
      name: "Open view",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            // this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
            true
          );
        }
        this.initLeaf();
      },
    });

    this.addCommand({
      id: "open-weekly-note",
      name: "Open Weekly Note",
      checkCallback: (checking) => {
        if (checking) {
          return !appHasPeriodicNotesPluginLoaded();
        }
        this.view.openOrCreateWeeklyNote(window.moment(), false);
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      callback: () => this.view.revealActiveNote(),
    });

    await this.loadOptions();

    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    if (this.app.workspace.layoutReady) {
      this.initLeaf();
    } else {
      this.registerEvent(
        this.app.workspace.on("layout-ready", this.initLeaf.bind(this))
      );
    }
  }

  initLeaf(): void {
    const leafs = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
    console.log("calendar leafs", leafs);
    if (leafs.length) {
      this.app.workspace.revealLeaf(leafs.first());
      return;
    }

    this.app.workspace.getRightLeaf(false).setViewState({
      type: VIEW_TYPE_CALENDAR,
    });
  }

  async loadOptions(): Promise<void> {
    const options = await this.loadData();
    settings.update((old) => {
      return {
        ...old,
        ...(options || {}),
      };
    });

    await this.saveData(this.options);
  }

  async writeOptions(
    changeOpts: (settings: ISettings) => Partial<ISettings>
  ): Promise<void> {
    settings.update((old) => ({ ...old, ...changeOpts(old) }));
    await this.saveData(this.options);
  }
}
