import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="6b066027-8a7d-4268-9608-89fa296c9640",
    name="Complete Checkout and Verify Total Amount",
    tc_id="TC-2",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"final_charged_amount_equals_item_prices_sum": "0"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:3000', instruction_id='d3b2f2d1-a7ae-4811-ae71-91b34098eda8'):
        await page.goto("http://localhost:3000")
    
    async with testmu.step('Clicking complete checkout with items currently in the cart', instruction_id='df9d98b8-e54a-4ff2-8d09-4203b0789dfe'):
        _loc_1 = page.locator("internal:role=link[name=\"Cart cart item count\"i]")
        
        await _loc_1.click()
    
    async with testmu.step('Clicking Checkout to complete the order', instruction_id='a400ecf2-3f21-429f-bf7f-8f4d3995beae'):
        _loc_2 = page.locator("internal:role=link[name=\"Checkout\"i]")
        
        await _loc_2.click()
    
    async with testmu.step('Clicking Place order to complete checkout with current cart items', instruction_id='30442bad-cfc7-4070-956d-6a2e350746a2'):
        _loc_3 = page.locator("internal:role=button[name=\"Place order\"i]")
        
        await _loc_3.click()
    
    async with testmu.step('Comparing the charged amount with the item prices total'):
        set_var('final_charged_amount_equals_item_prices_sum', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {13: 0, 7: 1};\n  const el = (i) => els[__m[i]];\n  const __v = (parseFloat((el(13).textContent.match(/[\\d.]+/)||[])[0])-parseFloat((el(7).textContent.match(/[\\d.]+/)||[])[0]));\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Charged: $"i', 'internal:text="Order total: $"i'], query='the difference between the charged amount in the order receipt and the item-price total in the checkout summary', expected_value='0', needs_unit_conversion=False, operator='equals', transforms=[], condition='the final charged amount equals the sum of the item prices'))
    
    async with testmu.step('Assertion check', instruction_id='b9134ff1-a951-4130-a15a-64dc769ac67a'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': 'the final charged amount equals the sum of the item prices', 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': '0', 'extracted_value': '{{final_charged_amount_equals_item_prices_sum}}', 'store_key': 'final_charged_amount_equals_item_prices_sum', 'variable_refs': {'{{final_charged_amount_equals_item_prices_sum}}': '0'}}], 'sub_checks': [{'description': 'the final charged amount equals the sum of the item prices', 'store_key': 'final_charged_amount_equals_item_prices_sum', 'expected_value': '0', 'extracted_value': '{{final_charged_amount_equals_item_prices_sum}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': 'the final charged amount equals the sum of the item prices'})


if __name__ == "__main__":
    testmu.run(test)