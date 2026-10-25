# Role & Permission Matrix

## Roles

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Full access to all menus and actions |
| `PG_OPERATOR` | Operations modules; no Administration security masters |

## Permission actions

`VIEW`, `ADD`, `EDIT`, `DELETE`, `EXPORT`, `PRINT`, `APPROVE`

## Operator access

Allowed: Dashboard, Tenant Management, Room & Bed, Rent, Payments, Deposits, Additional Charges, Receipts, Reports, Masters (operational), WhatsApp-related screens, About Software.

Restricted: Menu Master, Role Master, User Master, Role Permission Mapping, User Permission Mapping, System Settings, Audit Logs (and parent Administration).

## Resolution order

1. If role is `SUPER_ADMIN` → allow  
2. Else check `user_permission_overrides` for (user, menu, action)  
3. Else check `role_permissions`  
4. Default deny  

Frontend menus are generated from backend permission responses. Backend middleware enforces authorization independently.
