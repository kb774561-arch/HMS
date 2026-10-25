import { menuRepository } from "../repositories/menuRepository.js";
import { permissionService } from "./permissionService.js";

export type MenuNode = {
  id: string;
  menuName: string;
  routePath: string | null;
  icon: string | null;
  displayOrder: number;
  children: MenuNode[];
};

export const menuService = {
  async getMyMenus(userId: string): Promise<MenuNode[]> {
    const menus = await menuRepository.listActive();
    const allowed = await permissionService.getEffectiveViewMenuIds(userId);
    const filtered = menus.filter((m) => allowed.has(m.id));

    const nodes = new Map<string, MenuNode>();
    for (const m of filtered) {
      nodes.set(m.id, {
        id: m.id,
        menuName: m.menuName,
        routePath: m.routePath,
        icon: m.icon,
        displayOrder: m.displayOrder,
        children: [],
      });
    }

    const roots: MenuNode[] = [];
    for (const m of filtered) {
      const node = nodes.get(m.id)!;
      if (m.parentMenuId && nodes.has(m.parentMenuId)) {
        nodes.get(m.parentMenuId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortTree = (items: MenuNode[]) => {
      items.sort((a, b) => a.displayOrder - b.displayOrder);
      items.forEach((i) => sortTree(i.children));
    };
    sortTree(roots);
    return roots;
  },

  listAll() {
    return menuRepository.listAll();
  },
};
