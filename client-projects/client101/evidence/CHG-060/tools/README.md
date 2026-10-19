# CHG-060 image score tool

Requires Python 3 with `requests`, `Pillow` and `numpy`.

From the repository root:

```powershell
python client-projects/client101/evidence/CHG-060/tools/score-images.py `
  --manifest client-projects/client101/evidence/CHG-060/image-quality-233.json `
  --typescript services/experience-api/src/catalogue/image-quality-scores.generated.ts
```

The score is a staging-only display-fitness heuristic. It measures suitability
for the square product cards; it does not judge the product itself and is not a
replacement for a production DAM review.
