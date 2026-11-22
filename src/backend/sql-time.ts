import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/** As operações da Orbi são em Ipatinga (MG): "hoje", "esta semana" e o dia de cada relatório seguem o horário de Brasília, não o UTC do servidor. */
export const SP_TZ = "America/Sao_Paulo";

/** Início do dia, da semana ou do mês corrente em Brasília, como instante (timestamptz). */
export const startOfPeriodSp = (unit: "day" | "week" | "month"): SQL =>
  sql`date_trunc(${sql.raw(`'${unit}'`)}, now() AT TIME ZONE ${sql.raw(`'${SP_TZ}'`)}) AT TIME ZONE ${sql.raw(`'${SP_TZ}'`)}`;

/** Dia (AAAA-MM-DD) de um instante, em Brasília. */
export const dayLabelSp = (col: PgColumn | SQL): SQL<string> => sql<string>`to_char(${col} AT TIME ZONE ${sql.raw(`'${SP_TZ}'`)}, 'YYYY-MM-DD')`;

/** Instante em que o dia AAAA-MM-DD começa em Brasília (o texto já deve estar validado com isIsoDay). */
export const dayStartSp = (day: string): SQL => sql`(${day}::date)::timestamp AT TIME ZONE ${sql.raw(`'${SP_TZ}'`)}`;

/** Instante em que o dia seguinte a AAAA-MM-DD começa em Brasília: limite superior (exclusivo) de um período que inclui o dia inteiro. */
export const dayEndSp = (day: string): SQL => sql`((${day}::date + 1)::timestamp AT TIME ZONE ${sql.raw(`'${SP_TZ}'`)})`;
