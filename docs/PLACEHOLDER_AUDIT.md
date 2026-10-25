# Placeholder Audit — Genius Girls PG

Generated before full module implementation.

| Menu Name | Route | Current Component | Backend API | DB Tables | Status |
|-----------|-------|-------------------|-------------|-----------|--------|
| Live Overview | `/dashboard` | DashboardPage | GET overview | beds, allocations, payments… | Partial |
| Monthly Overview | `/dashboard/monthly` | DashboardPage (same) | same | same | Partial |
| Tenant Registration | `/tenants/register` | PlaceholderPage (*) | Missing | tenants, beds | Placeholder |
| Tenant List | `/tenants` | PlaceholderPage (*) | Missing | tenants | Placeholder |
| Tenant Profile | `/tenants/profile` | PlaceholderPage (*) | Missing | tenants+finance | Placeholder |
| Tenant History | `/tenants/history` | PlaceholderPage (*) | Missing | allocations | Placeholder |
| Room Master | `/rooms` | PlaceholderPage (*) | Missing | rooms | Placeholder |
| Bed Master | `/beds` | PlaceholderPage (*) | Missing | beds | Placeholder |
| Room Summary | `/rooms/summary` | PlaceholderPage (*) | Missing | rooms/beds | Placeholder |
| Bed Availability | `/beds/availability` | PlaceholderPage (*) | Missing | beds/allocations | Placeholder |
| Bed Booking | `/beds/booking` | PlaceholderPage (*) | Missing | allocations | Placeholder |
| Bed Transfer | `/beds/transfer` | PlaceholderPage (*) | Missing | allocations | Placeholder |
| Generate Monthly Rent | `/rent/generate` | PlaceholderPage (*) | Missing | rent_invoices | Placeholder |
| Monthly Rent Register | `/rent/register` | PlaceholderPage (*) | Missing | rent_invoices | Placeholder |
| Collect Rent | `/rent/collect` | PlaceholderPage (*) | Missing | payments | Placeholder |
| Pending Rent | `/rent/pending` | PlaceholderPage (*) | Missing | rent_invoices | Placeholder |
| Rent Adjustments | `/rent/adjustments` | PlaceholderPage (*) | Missing | financial_adjustments | Placeholder |
| Payment Entry | `/payments/entry` | PlaceholderPage (*) | Missing | payments | Placeholder |
| Payment Summary | `/payments` | PlaceholderPage (*) | Missing | payments | Placeholder |
| Account-wise Collection | `/payments/accounts` | PlaceholderPage (*) | Missing | payments | Placeholder |
| Unallocated Payments | `/payments/unallocated` | PlaceholderPage (*) | Missing | payments | Placeholder |
| Receipt Register | `/payments/receipts` | PlaceholderPage (*) | Missing | payment_receipts | Placeholder |
| Collect Deposit | `/deposits/collect` | PlaceholderPage (*) | Missing | security_deposit_transactions | Placeholder |
| Deposit Summary | `/deposits` | PlaceholderPage (*) | Missing | same | Placeholder |
| Deposit Refund | `/deposits/refund` | PlaceholderPage (*) | Missing | same | Placeholder |
| Charge Type Master | `/charges/types` | PlaceholderPage (*) | Missing | charge_types | Placeholder |
| Additional Charge Entry | `/charges/entry` | PlaceholderPage (*) | Missing | additional_charges | Placeholder |
| Charge Collection | `/charges/collect` | PlaceholderPage (*) | Missing | additional_charges | Placeholder |
| Reports (all) | `/reports/*` | PlaceholderPage (*) | Missing | various | Placeholder |
| Masters (all) | `/masters/*` | PlaceholderPage (*) | Missing | masters | Placeholder |
| Menu Master | `/admin/menus` | PlaceholderPage | GET only | menus | Placeholder |
| Role Master | `/admin/roles` | PlaceholderPage | GET only | roles | Placeholder |
| User Master | `/admin/users` | PlaceholderPage | GET only | users | Placeholder |
| Role Permissions | `/admin/role-permissions` | PlaceholderPage | Missing | role_permissions | Placeholder |
| User Permissions | `/admin/user-permissions` | PlaceholderPage | Missing | user_permission_overrides | Placeholder |
| System Settings | `/admin/settings` | PlaceholderPage | Missing | system_settings | Placeholder |
| Audit Logs | `/admin/audit-logs` | PlaceholderPage | Missing | audit_logs | Placeholder |
| About Product | `/about/product` | AboutProductPage | N/A | N/A | Complete |
| About Karmatechlab | `/about/karmatechlab` | AboutKarmatechlabPage | N/A | N/A | Complete |

`(*)` = catch-all `path="*"` → PlaceholderPage

Working preserved: auth, JWT, dynamic menus, branding, `genius_pg` schema, seed data.
