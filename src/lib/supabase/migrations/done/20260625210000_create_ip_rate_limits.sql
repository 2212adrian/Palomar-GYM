-- Create the rate-limiting table
create table if not exists public.rate_limits (
  ip text primary key,
  last_requested_at timestamp with time zone default now() not null
);

-- Enable Row Level Security (No policies are created, meaning only the private service_role key can read/write this table)
alter table public.rate_limits enable row level security;