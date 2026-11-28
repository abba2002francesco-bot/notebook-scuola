create policy study_notes_service_role_only
on public.study_notes
for all
to service_role
using (true)
with check (true);
