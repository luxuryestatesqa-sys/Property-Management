-- Bedrooms: Studio, then 1 to 10. "6+" (SIX_PLUS) stays in the enum for old data but is no longer offered.
ALTER TYPE "BedroomCount" ADD VALUE 'SIX' AFTER 'FIVE_PLUS_MAID';
ALTER TYPE "BedroomCount" ADD VALUE 'SEVEN' AFTER 'SIX';
ALTER TYPE "BedroomCount" ADD VALUE 'EIGHT' AFTER 'SEVEN';
ALTER TYPE "BedroomCount" ADD VALUE 'NINE' AFTER 'EIGHT';
ALTER TYPE "BedroomCount" ADD VALUE 'TEN' AFTER 'NINE';
