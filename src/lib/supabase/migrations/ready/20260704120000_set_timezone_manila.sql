-- Migration: Set default database timezone to Asia/Manila (PHT)
-- Timestamp: 20260704120000

-- Alters the default 'postgres' database configuration so every new connection session 
-- automatically defaults to the Asia/Manila timezone.
ALTER DATABASE postgres SET timezone TO 'Asia/Manila';