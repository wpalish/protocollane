import {
  F,
  S,
  R,
  C,
  live,
  rows,
  byId,
  unique,
  required,
  minor,
  amount,
  interval,
  noOverlap,
  changed,
  immutable,
  admin,
  totalLines,
  summary,
  clock,
  label,
} from "./core/rules.js";
const definition = {
  slug: "protocollane",
  reference: 81,
  title: "ProtocolLane",
  description:
    "Проверяемые задачи из вставленного протокола: точная цитата, ответственный, срок и состояние. Аудиозапись и ASR отсутствуют.",
  limitations:
    "Одна организация · Собственный сервер · Ручной ввод · Без банковских и внешних интеграций",
  collections: [
    C("meetings", "Протоколы", [
      F("title", "Встреча"),
      F("date", "Дата", "date"),
      F("transcript", "Разрешённый текст протокола", "textarea"),
      S("status", "Состояние", [
        ["draft", "Черновик"],
        ["reviewed", "Проверен человеком"],
      ]),
    ]),
    C("tasks", "Задачи", [
      R("meeting", "Протокол", "meetings"),
      F("quote", "Точная исходная цитата", "textarea"),
      F("action", "Задача"),
      F("owner", "Ответственный"),
      F("due", "Срок", "date"),
      S("status", "Состояние", [
        ["open", "Открыта"],
        ["done", "Выполнена"],
      ]),
    ]),
  ],
  validate(state, before, command, actor) {
    for (const task of live(state, "tasks"))
      required(
        byId(state, "meetings", task.meeting).transcript.includes(task.quote),
        "Цитата не найдена в исходном протоколе.",
      );
    for (const m of rows(state, "meetings")) {
      const old = changed(before, "meetings", m.id);
      if (old?.status === "reviewed")
        immutable(old, m, ["title", "date", "transcript"]);
    }
  },
  summarize(state) {
    return rows(state, "meetings").map((m) =>
      summary(
        m.title,
        ...live(state, "tasks")
          .filter((t) => t.meeting === m.id)
          .map(
            (t) =>
              t.owner +
              " · " +
              t.due +
              " · " +
              t.action +
              " [" +
              label(definition, "tasks", "status", t.status) +
              "] · Источник: «" +
              t.quote +
              "»",
          ),
        "Задачи создаёт и проверяет человек; сохранённая цитата не заменяет согласие участника.",
      ),
    );
  },
};
export default definition;
