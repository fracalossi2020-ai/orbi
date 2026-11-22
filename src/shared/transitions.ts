export type RideStatus = "scheduled" | "searching" | "accepted" | "arrived" | "in_progress" | "completed" | "cancelled" | "no_driver";

const ALLOWED: Record<RideStatus, RideStatus[]> = {
  scheduled: ["searching", "cancelled"],
  searching: ["accepted", "cancelled", "no_driver"],
  accepted: ["arrived", "cancelled", "searching"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [], cancelled: [], no_driver: [],
};
export const canTransition = (from: RideStatus, to: RideStatus) => ALLOWED[from].includes(to);
export const ACTIVE_STATUSES: RideStatus[] = ["searching", "accepted", "arrived", "in_progress"];
/**
 * Só nestes status a posição do motorista pode ir para quem vê a corrida. Depois dela (concluída, cancelada) ou antes
 * de ele aceitar, a posição "atual" dele já não tem relação com a corrida e seria rastreamento do motorista.
 */
export const DRIVER_LOCATION_STATUSES: RideStatus[] = ["accepted", "arrived", "in_progress"];
export const showsDriverLocation = (status: RideStatus) => DRIVER_LOCATION_STATUSES.includes(status);
export const STATUS_LABEL: Record<RideStatus, string> = {
  scheduled: "Agendada", searching: "Procurando motorista", accepted: "Motorista a caminho", arrived: "Motorista chegou",
  in_progress: "Em viagem", completed: "Concluída", cancelled: "Cancelada", no_driver: "Sem motorista disponível",
};

/**
 * Equipe resolve corrida presa. Encerrar (cobrando) só vale em viagem; cancelar (sem cobrança) em qualquer corrida aberta.
 * Fica fora de ALLOWED de propósito: passageiro e motorista continuam sem poder cancelar durante a viagem.
 */
export const STAFF_CLOSE_FROM: RideStatus[] = ["in_progress"];
export const STAFF_CANCEL_FROM: RideStatus[] = ["scheduled", "searching", "accepted", "arrived", "in_progress"];
