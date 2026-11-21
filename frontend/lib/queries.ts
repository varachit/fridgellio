import { queryOptions } from "@tanstack/react-query";
import { allPages, api } from "./api";
import type {
  Household,
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

function paginated<T extends { id: string }>(path: string) {
  return queryOptions({
    queryKey: [path],
    queryFn: ({ signal }) => allPages<T>(path, signal),
  });
}

export const householdQuery = read<Household | null>("household");
export const preferencesQuery = read<{ language: Language }>("preferences");
export const foodsQuery = read<Named[]>("preferences/foods-to-avoid");
export const equipmentQuery = paginated<Named>("equipment");
export const historyQuery = paginated<StockEvent>("inventory-history");
export const menusQuery = paginated<Menu>("menus");
export const inventoryQuery = (day: string) =>
  queryOptions({
    queryKey: ["inventory", day],
    queryFn: ({ signal }) => allPages<Stock>("inventory?today=" + day, signal),
  });
