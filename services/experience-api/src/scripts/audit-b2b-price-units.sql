-- Read-only audit for the B2B price-unit defect found on 19 Nov 2026.
-- Run against the Medusa database. Any row below 100 is suspicious for this catalogue and should be
-- compared with the product's buildkart_b2b_pricing snapshot before accepting B2B orders.
select pl.title,
       p.amount,
       p.min_quantity,
       p.currency_code
from price_list pl
join price p on p.price_list_id = pl.id
where pl.title like 'BuildKart B2B Studio%'
  and p.amount < 100
order by pl.title, p.min_quantity nulls first;
