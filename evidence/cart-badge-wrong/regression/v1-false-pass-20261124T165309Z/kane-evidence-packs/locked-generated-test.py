import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="25a63130-d534-4b3e-baf5-a3de4bd38c0d",
    name="Add Shirts to Cart and Verify Total",
    tc_id="TC-1",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"cart_badge_count_check": "Cart 3", "charged_total_matches_items_sum": "true"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:3000', instruction_id='e025be41-0017-49d4-a852-e40fcd61e916'):
        await page.goto("http://localhost:3000")
    _condition_met = False
    _until_retries = 0
    while _until_retries < 10:
        print(f"[until-loop] iteration {_until_retries + 1}/10")
        async with testmu.step('Adding 3 shirts to the cart', instruction_id='429d05d4-2b0d-43fe-8d87-9e79c6ef992f'):
            _loc_1 = page.locator("internal:role=button[name=\"Add shirt to cart\"i]")
            
            await _loc_1.click()
        await page.wait_for_timeout(500)
        if await testmu.check_until_condition(page, "the cart badge shows '3'"):
            _condition_met = True
            break
        _until_retries += 1
    set_var("__result__", {"condition_met": _condition_met, "retries": _until_retries + 1})
    
    async with testmu.step('Reading the cart badge count'):
        set_var('cart_badge_count_check', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {3: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(3).innerText.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=link[name="Cart cart item count"i]'], query='the cart item count displayed in the cart link badge in the header', expected_value='3', needs_unit_conversion=False, operator='equals', transforms=['extract_number'], condition='the cart badge shows exactly 3.'))
    
    async with testmu.step('Assertion check', instruction_id='c1954700-b946-472d-a81c-fbd729916a56'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': 'the cart badge shows exactly 3.', 'passed': True, 'operator': 'equals', 'transforms': ['extract_number'], 'json_path': None, 'expected': '3', 'extracted_value': '{{cart_badge_count_check}}', 'store_key': 'cart_badge_count_check', 'variable_refs': {'{{cart_badge_count_check}}': 'Cart 3'}}], 'sub_checks': [{'description': 'the cart badge shows exactly 3.', 'store_key': 'cart_badge_count_check', 'expected_value': '3', 'extracted_value': '{{cart_badge_count_check}}', 'operator': 'equals', 'transforms': ['extract_number']}], 'composite_operator': 'and', 'claim': 'the cart badge shows exactly 3.'})
    
    async with testmu.step('Clicking to open the cart in the top navigation bar', instruction_id='5257836d-672c-4c52-a20a-659f7e888aae'):
        _loc_2 = page.locator("internal:role=link[name=\"Cart cart item count\"i]")
        
        await _loc_2.click()
    _condition_met = False
    _until_retries = 0
    while _until_retries < 10:
        print(f"[until-loop] iteration {_until_retries + 1}/10")
        async with testmu.step('Waiting for the cart page to load', instruction_id='fdbd220e-1d4c-4e1c-91d9-dba6a04e0c86'):
            await page.wait_for_timeout(500)
        await page.wait_for_timeout(500)
        if await testmu.check_until_condition(page, "the heading 'Your cart' is visible"):
            _condition_met = True
            break
        _until_retries += 1
    set_var("__result__", {"condition_met": _condition_met, "retries": _until_retries + 1})
    
    async with testmu.step('Comparing the cart total with the sum of item line totals'):
        set_var('charged_total_matches_items_sum', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {4: 0};\n  const el = (i) => els[__m[i]];\n  const __v = ((() => { const table = el(4).querySelector('table'); const sum = Array.from(table.querySelectorAll('tbody tr')).reduce((total, row) => total + Number(row.cells[3].innerText.replace(/[^0-9.-]/g, '')), 0); const totalText = Array.from(el(4).querySelectorAll('p')).map(p => p.innerText.trim()).find(text => text.startsWith('Total:')); const charged = Number((totalText || '').replace(/[^0-9.-]/g, '')); return charged === sum; })());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Your cart ItemPriceQtyLine"i'], query='whether the total amount in the cart summary equals the sum of the line totals in the cart table', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition='the charged total matches the sum of the items.'))
    
    async with testmu.step('Assertion check', instruction_id='f240048d-62e1-480a-90ae-8d82fa9e7be8'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': 'the charged total matches the sum of the items.', 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{charged_total_matches_items_sum}}', 'store_key': 'charged_total_matches_items_sum', 'variable_refs': {'{{charged_total_matches_items_sum}}': 'true'}}], 'sub_checks': [{'description': 'the charged total matches the sum of the items.', 'store_key': 'charged_total_matches_items_sum', 'expected_value': 'true', 'extracted_value': '{{charged_total_matches_items_sum}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': 'the charged total matches the sum of the items.'})


if __name__ == "__main__":
    testmu.run(test)