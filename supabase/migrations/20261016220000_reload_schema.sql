-- Lazimisha PostgREST kupakia upya schema cache
-- (baada ya kuongeza majedwali kwenye migration ya awali)
select pg_notify('pgrst', 'reload schema');
