import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/account_models.dart';
import 'package:prototype_app/providers/account_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('a saved address maps every canonical checkout field', () {
    const saved = SavedAddress(
      id: 'addr_office',
      label: 'Office',
      fullName: 'Rahul Sharma',
      phone: '+91 98765 43210',
      line1: '3rd Floor, Sunrise Tower',
      line2: 'MG Road',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001',
    );

    final address = saved.toCheckoutAddress();
    expect(address.firstName, 'Rahul');
    expect(address.lastName, 'Sharma');
    expect(address.address1, '3rd Floor, Sunrise Tower');
    expect(address.address2, 'MG Road');
    expect(address.city, 'Jaipur');
    expect(address.province, 'Rajasthan');
    expect(address.postalCode, '302001');
    expect(address.countryCode, 'IN');
    expect(address.phone, '+91 98765 43210');

    final json = address.toJson();
    expect(json['phone'], '+91 98765 43210');
    expect(json['address_2'], 'MG Road');
    expect(json['province'], 'Rajasthan');
  });

  test('checkout prefers the last used address, then the default', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);

    expect(container.read(checkoutStartAddressProvider)!.id, 'addr_home');

    await container.read(lastCheckoutAddressProvider.notifier).set('addr_site');
    expect(container.read(checkoutStartAddressProvider)!.id, 'addr_site');

    // A deleted/stale id falls back to the default rather than an empty state.
    await container
        .read(lastCheckoutAddressProvider.notifier)
        .set('addr_removed');
    expect(container.read(checkoutStartAddressProvider)!.id, 'addr_home');
  });

  test('the legacy two-address seed gains the office address once', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final store = LocalStore(prefs);
    await store.writeAddresses(const <SavedAddress>[
      SavedAddress(
        id: 'addr_home',
        label: 'Home',
        fullName: 'Rahul Sharma',
        phone: '+91 98765 43210',
        line1: 'B-24, Shanti Kunj',
        city: 'Bhiwadi',
        state: 'Rajasthan',
        pincode: '301019',
        isDefault: true,
      ),
      SavedAddress(
        id: 'addr_site',
        label: 'Site',
        fullName: 'Rahul Sharma',
        phone: '+91 98765 43210',
        line1: 'Plot 14',
        city: 'Bhiwadi',
        state: 'Rajasthan',
        pincode: '301019',
      ),
    ]);

    final container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    final addresses = container.read(addressesProvider);
    expect(addresses.map((a) => a.id), contains('addr_office'));
    expect(addresses, hasLength(3));

    // A second read does not duplicate the office address.
    final again = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(again.dispose);
    expect(again.read(addressesProvider), hasLength(3));
  });
}
