-- U-025 product-type backfill (2026-11-02)
--
-- Staging-only data repair. Product type was populated for one catalogue slice
-- from the governed import taxonomy (metadata.category_l2), never from titles,
-- and five legacy values were normalised to the same vocabulary:
--
--   Phone / Mobile / MOBILE PHONES  -> Mobile Phone
--   Basin Mixer                     -> Basin Mixer & Tap
--   Colour & Parts (wall putty)     -> Wall Putty
--
-- Idempotent: the backup keeps the pre-change metadata, and the update only
-- touches rows that have no product_type_source yet.
--
-- Run on the staging host from the active release:
--   docker exec -i buildkart-hosted-pilot-postgres-1 psql -U buildkart -d buildkart -v ON_ERROR_STOP=1 \
--     < services/hosted/scripts/u025-product-type-backfill.sql

\set ON_ERROR_STOP on

begin;

create table if not exists u025_product_type_backup_20261102 (
  id text primary key,
  metadata jsonb
);

-- The table was first created with CREATE TABLE AS (no key); add the unique
-- index so re-running the script keeps the original backup rows untouched.
create unique index if not exists u025_product_type_backup_id_idx
  on u025_product_type_backup_20261102 (id);

insert into u025_product_type_backup_20261102 (id, metadata)
select p.id, p.metadata
from product p
join (values
  ('prod_01M59JS6NH2HX8XVNB067JSQP1', 'Adhesive'),
  ('prod_01M59JSBQ0ZAB23M4K5MG4CZYC', 'Adhesive'),
  ('prod_01M59JSBYN96QB8AWQVNQ5BB3Q', 'Adhesive'),
  ('prod_01M59JSCD6D70Q0DF13Z0P7P10', 'Adhesive'),
  ('prod_01M59JSE6D6XKCCF9CR0ZXVN4Y', 'Adhesive'),
  ('prod_01M59JHM2TMKBAYKEXTMJ3QE1W', 'Basin Mixer & Tap'),
  ('prod_01M59JRAX6CNQR17V96RE05Q41', 'Basin Mixer & Tap'),
  ('prod_01M59JRB3JVF2G608QH0TSAVDS', 'Basin Mixer & Tap'),
  ('prod_01M59JRBA2K92Z62X33XMKY7Y2', 'Basin Mixer & Tap'),
  ('prod_01M59JRBGSJ0AAGA1MYPAJ7KHP', 'Basin Mixer & Tap'),
  ('prod_01M59JRCRTTF46T75CCDQYWB3X', 'Basin Mixer & Tap'),
  ('prod_01M59JRD05PWV8G6PXF9WYPEY6', 'Basin Mixer & Tap'),
  ('prod_01M59JRD7ZF4CV5DWY6G0QCK9A', 'Basin Mixer & Tap'),
  ('prod_01M59JRDG489F570HRT7GEPCCG', 'Basin Mixer & Tap'),
  ('prod_01M59JRDPRQ7543ACDTF5DE8FG', 'Basin Mixer & Tap'),
  ('prod_01M59JRDYJT4W267HD109RPJET', 'Basin Mixer & Tap'),
  ('prod_01M59JRE5VGVZR4XD97Q05PPW1', 'Basin Mixer & Tap'),
  ('prod_01M59JREDT3A32ZHP0ES1EMCVR', 'Basin Mixer & Tap'),
  ('prod_01M59JREW2XZ5R7HMV820P6CW2', 'Basin Mixer & Tap'),
  ('prod_01M59JRF363J439FEF1F2GAH94', 'Basin Mixer & Tap'),
  ('prod_01M59JS858JAZGRXAXPW11QG9R', 'Building Material'),
  ('prod_01M59JS93XDX8BXYJWGG66EC43', 'Building Material'),
  ('prod_01M59JS9C10CTWEG6H0YDFTYS4', 'Building Material'),
  ('prod_01M59JSBFXT8TRNVREHW67KVSG', 'Building Material'),
  ('prod_01M59JRNGBHG45CXK7A346M0YA', 'Bulb'),
  ('prod_01M59JRP6A0W9YVG89J2A3AM5K', 'Bulb'),
  ('prod_01M59JS4ZCCQY02A683W11XM5X', 'Cement'),
  ('prod_01M59JS57DVZZQKKEQGY2GNT56', 'Cement'),
  ('prod_01M59JS76P28HT23GR08SKRWTZ', 'Cement'),
  ('prod_01M59JS7E1JE60DPQY3A4V2A89', 'Cement'),
  ('prod_01M5WHD7PM31ZN6GNAEKQTRZ76', 'Mobile Phone'),
  ('prod_01M637Y1F4N6AZF9BRC5K7KP6S', 'Mobile Phone'),
  ('prod_01M699CZFCAMBVAVF0THEK25H2', 'Mobile Phone'),
  ('prod_01M59JS2TY04B31D71SD7FG0TC', 'Paint'),
  ('prod_01M59JS37ZZ4M0EEXS4ZNJGQ9E', 'Paint'),
  ('prod_01M59JS3EFW6B0ZWTD654QKWXN', 'Paint'),
  ('prod_01M59JS3NGZBGZ0BS3GA4FF68T', 'Paint'),
  ('prod_01M59JRADPYPB0SDPJHTRK5GWK', 'Pipe & Tank'),
  ('prod_01M59JRAP467QJ0N95F1NQXP6M', 'Pipe & Tank'),
  ('prod_01M59JS42KZC3A5YYSTDKK08WW', 'Plywood & Board'),
  ('prod_01M59JS4HYNQX0EXVTM2R67CM8', 'Plywood & Board'),
  ('prod_01M59JS4RZH0ECJV2HZCMNE08B', 'Plywood & Board'),
  ('prod_01M59JS5X84SXK44EECAE73X31', 'Plywood & Board'),
  ('prod_01M59JS6598A8RE0NASNC562EM', 'Plywood & Board'),
  ('prod_01M59JS6EEVNPWWR2WMFDG8XY9', 'Plywood & Board'),
  ('prod_01M59JS8DBNH596037G8T287NM', 'Plywood & Board'),
  ('prod_01M59JS8NRNNR51KN6DPNMMT97', 'Plywood & Board'),
  ('prod_01M59JS8WNRZNQQYVG3QSV7JNW', 'Plywood & Board'),
  ('prod_01M59JRKJ5627J4BWGVDRM2MSA', 'Switch & Socket'),
  ('prod_01M59JRM9MFA26PNDQN9N1KGAA', 'Switch & Socket'),
  ('prod_01M59JRQ7ZERKG8BGWHQ1YJ810', 'Switch & Socket'),
  ('prod_01M59JS5F14XZK4HKSJ0V2FEYR', 'Tile Adhesive'),
  ('prod_01M59JS5P3ABPYGWVS3CHPES8K', 'Tile Adhesive'),
  ('prod_01M59JS6Y9J5PZQX6NFZ166B6F', 'Tile Adhesive'),
  ('prod_01M59JS7PHJ7JKJS3N5XM8KGNE', 'Tile Adhesive'),
  ('prod_01M59JS7Y5BQQ1FE43E17Z6CJM', 'Tile Adhesive'),
  ('prod_01M59JRBREADA2VRZ2JQSGYC2E', 'WC & Flushing'),
  ('prod_01M59JRCBY5G5QSRCP7XFWCXGS', 'WC & Flushing'),
  ('prod_01M59JRCJKRDWNQ4256NE5K9B0', 'WC & Flushing'),
  ('prod_01M5WA6E8KB4BACYCH7Y93RB4N', 'Wall Putty'),
  ('prod_01M59JRBYSR3VW8BSVRQKP18R4', 'Wash Basin'),
  ('prod_01M59JREMZ8RGEF2NVNMYC37QN', 'Wash Basin'),
  ('prod_01M59JS9M3TCWKNQRPSE0V569D', 'Waterproofing'),
  ('prod_01M59JS9WK2Y45YA57Y5DAVWKT', 'Waterproofing'),
  ('prod_01M59JSA3QN601KTDEN9TGWKY8', 'Waterproofing'),
  ('prod_01M59JSABAGCNQRMYFZP9C4VE4', 'Waterproofing'),
  ('prod_01M59JSAJSHDHDKAEYAC593H7Q', 'Waterproofing'),
  ('prod_01M59JSASB0N1CDJTKBQSRS2FJ', 'Waterproofing'),
  ('prod_01M59JSB10293WXEQB7Y27AGC4', 'Waterproofing'),
  ('prod_01M59JSB8RYNJ16F71RA7VKHEW', 'Waterproofing')
) as m(id, type) on m.id = p.id
on conflict (id) do nothing;

update product p
set metadata = jsonb_set(
      jsonb_set(p.metadata, '{product_type}', to_jsonb(m.type)),
      '{product_type_source}', to_jsonb('u025_backfill_20261102'::text))
from (values
  ('prod_01M59JS6NH2HX8XVNB067JSQP1', 'Adhesive'),
  ('prod_01M59JSBQ0ZAB23M4K5MG4CZYC', 'Adhesive'),
  ('prod_01M59JSBYN96QB8AWQVNQ5BB3Q', 'Adhesive'),
  ('prod_01M59JSCD6D70Q0DF13Z0P7P10', 'Adhesive'),
  ('prod_01M59JSE6D6XKCCF9CR0ZXVN4Y', 'Adhesive'),
  ('prod_01M59JHM2TMKBAYKEXTMJ3QE1W', 'Basin Mixer & Tap'),
  ('prod_01M59JRAX6CNQR17V96RE05Q41', 'Basin Mixer & Tap'),
  ('prod_01M59JRB3JVF2G608QH0TSAVDS', 'Basin Mixer & Tap'),
  ('prod_01M59JRBA2K92Z62X33XMKY7Y2', 'Basin Mixer & Tap'),
  ('prod_01M59JRBGSJ0AAGA1MYPAJ7KHP', 'Basin Mixer & Tap'),
  ('prod_01M59JRCRTTF46T75CCDQYWB3X', 'Basin Mixer & Tap'),
  ('prod_01M59JRD05PWV8G6PXF9WYPEY6', 'Basin Mixer & Tap'),
  ('prod_01M59JRD7ZF4CV5DWY6G0QCK9A', 'Basin Mixer & Tap'),
  ('prod_01M59JRDG489F570HRT7GEPCCG', 'Basin Mixer & Tap'),
  ('prod_01M59JRDPRQ7543ACDTF5DE8FG', 'Basin Mixer & Tap'),
  ('prod_01M59JRDYJT4W267HD109RPJET', 'Basin Mixer & Tap'),
  ('prod_01M59JRE5VGVZR4XD97Q05PPW1', 'Basin Mixer & Tap'),
  ('prod_01M59JREDT3A32ZHP0ES1EMCVR', 'Basin Mixer & Tap'),
  ('prod_01M59JREW2XZ5R7HMV820P6CW2', 'Basin Mixer & Tap'),
  ('prod_01M59JRF363J439FEF1F2GAH94', 'Basin Mixer & Tap'),
  ('prod_01M59JS858JAZGRXAXPW11QG9R', 'Building Material'),
  ('prod_01M59JS93XDX8BXYJWGG66EC43', 'Building Material'),
  ('prod_01M59JS9C10CTWEG6H0YDFTYS4', 'Building Material'),
  ('prod_01M59JSBFXT8TRNVREHW67KVSG', 'Building Material'),
  ('prod_01M59JRNGBHG45CXK7A346M0YA', 'Bulb'),
  ('prod_01M59JRP6A0W9YVG89J2A3AM5K', 'Bulb'),
  ('prod_01M59JS4ZCCQY02A683W11XM5X', 'Cement'),
  ('prod_01M59JS57DVZZQKKEQGY2GNT56', 'Cement'),
  ('prod_01M59JS76P28HT23GR08SKRWTZ', 'Cement'),
  ('prod_01M59JS7E1JE60DPQY3A4V2A89', 'Cement'),
  ('prod_01M5WHD7PM31ZN6GNAEKQTRZ76', 'Mobile Phone'),
  ('prod_01M637Y1F4N6AZF9BRC5K7KP6S', 'Mobile Phone'),
  ('prod_01M699CZFCAMBVAVF0THEK25H2', 'Mobile Phone'),
  ('prod_01M59JS2TY04B31D71SD7FG0TC', 'Paint'),
  ('prod_01M59JS37ZZ4M0EEXS4ZNJGQ9E', 'Paint'),
  ('prod_01M59JS3EFW6B0ZWTD654QKWXN', 'Paint'),
  ('prod_01M59JS3NGZBGZ0BS3GA4FF68T', 'Paint'),
  ('prod_01M59JRADPYPB0SDPJHTRK5GWK', 'Pipe & Tank'),
  ('prod_01M59JRAP467QJ0N95F1NQXP6M', 'Pipe & Tank'),
  ('prod_01M59JS42KZC3A5YYSTDKK08WW', 'Plywood & Board'),
  ('prod_01M59JS4HYNQX0EXVTM2R67CM8', 'Plywood & Board'),
  ('prod_01M59JS4RZH0ECJV2HZCMNE08B', 'Plywood & Board'),
  ('prod_01M59JS5X84SXK44EECAE73X31', 'Plywood & Board'),
  ('prod_01M59JS6598A8RE0NASNC562EM', 'Plywood & Board'),
  ('prod_01M59JS6EEVNPWWR2WMFDG8XY9', 'Plywood & Board'),
  ('prod_01M59JS8DBNH596037G8T287NM', 'Plywood & Board'),
  ('prod_01M59JS8NRNNR51KN6DPNMMT97', 'Plywood & Board'),
  ('prod_01M59JS8WNRZNQQYVG3QSV7JNW', 'Plywood & Board'),
  ('prod_01M59JRKJ5627J4BWGVDRM2MSA', 'Switch & Socket'),
  ('prod_01M59JRM9MFA26PNDQN9N1KGAA', 'Switch & Socket'),
  ('prod_01M59JRQ7ZERKG8BGWHQ1YJ810', 'Switch & Socket'),
  ('prod_01M59JS5F14XZK4HKSJ0V2FEYR', 'Tile Adhesive'),
  ('prod_01M59JS5P3ABPYGWVS3CHPES8K', 'Tile Adhesive'),
  ('prod_01M59JS6Y9J5PZQX6NFZ166B6F', 'Tile Adhesive'),
  ('prod_01M59JS7PHJ7JKJS3N5XM8KGNE', 'Tile Adhesive'),
  ('prod_01M59JS7Y5BQQ1FE43E17Z6CJM', 'Tile Adhesive'),
  ('prod_01M59JRBREADA2VRZ2JQSGYC2E', 'WC & Flushing'),
  ('prod_01M59JRCBY5G5QSRCP7XFWCXGS', 'WC & Flushing'),
  ('prod_01M59JRCJKRDWNQ4256NE5K9B0', 'WC & Flushing'),
  ('prod_01M5WA6E8KB4BACYCH7Y93RB4N', 'Wall Putty'),
  ('prod_01M59JRBYSR3VW8BSVRQKP18R4', 'Wash Basin'),
  ('prod_01M59JREMZ8RGEF2NVNMYC37QN', 'Wash Basin'),
  ('prod_01M59JS9M3TCWKNQRPSE0V569D', 'Waterproofing'),
  ('prod_01M59JS9WK2Y45YA57Y5DAVWKT', 'Waterproofing'),
  ('prod_01M59JSA3QN601KTDEN9TGWKY8', 'Waterproofing'),
  ('prod_01M59JSABAGCNQRMYFZP9C4VE4', 'Waterproofing'),
  ('prod_01M59JSAJSHDHDKAEYAC593H7Q', 'Waterproofing'),
  ('prod_01M59JSASB0N1CDJTKBQSRS2FJ', 'Waterproofing'),
  ('prod_01M59JSB10293WXEQB7Y27AGC4', 'Waterproofing'),
  ('prod_01M59JSB8RYNJ16F71RA7VKHEW', 'Waterproofing')
) as m(id, type)
where p.id = m.id
  and coalesce(p.metadata->>'product_type_source', '') = '';

commit;

select metadata->>'product_type' as product_type, count(*) as n
from product
where metadata->>'product_type_source' = 'u025_backfill_20261102'
group by 1
order by 2 desc, 1;

-- Rollback:
-- update product p
-- set metadata = b.metadata
-- from u025_product_type_backup_20261102 b
-- where p.id = b.id;
