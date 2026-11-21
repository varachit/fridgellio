import { queryOptions } from "@tanstack/react-query";
import { allPages, api } from "./api";
import type {
  Household,
  HouseholdMember,
  Language,
  Menu,
  Named,
  Stock,
  StockEvent,
} from "./pantry";

function read<T>(path: string) {
  return queryOptions({
    queryKey: [path],
    queryFn: ({ signal }) => api<T>(path, "GET", undefined, { signal }),
  });
}

function paginated<T extends { id: string }>(path: string, queryKey = [path]) {
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) => allPages<T>(path, signal),
  });
}

export const householdQuery = read<Household | null>("household");
export const membersQuery = read<HouseholdMember[]>("household/members");
export type PendingInvitation = { id: string; expires_at: string };
export const invitationsPath = "household/invitations";
export const invitationsQuery = read<PendingInvitation[]>(invitationsPath);
export const preferencesQuery = read<{ language: Language }>("preferences");
export type Profile = { first_name: string | null; last_name: string | null };
export const profileQuery = read<Profile>("preferences/profile");
export const foodsQuery = read<Named[]>("preferences/foods-to-avoid");
export const equipmentQuery = paginated<Named>("equipment");
export const historyQuery = paginated<StockEvent>("inventory-history");
export const entryEventsQuery = (id: string) =>
  paginated<StockEvent>(`inventory/${id}/events`, ["inventory", id, "events"]);
export const menusQuery = paginated<Menu>("menus");
export const inventoryQuery = (day: string) =>
  queryOptions({
    queryKey: ["inventory", day],
    queryFn: ({ signal }) => allPages<Stock>("inventory?today=" + day, signal),
  });
